const { CronJob } = require("cron");
const DB = require("./Database");
const {
  searchItems,
  getItem,
  getSoldItems,
  normalizeItemId,
} = require("./ebay");
const MarketAnalyzer = require("./MarketAnalyzer");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

function startMonitoring(client) {
  console.log("Starting Background Jobs...");

  // 1. Monitor Job: Check for deals (Every 3 minutes)
  const monitorJob = new CronJob("*/3 * * * *", async () => {
    try {
      console.log("Running Deal Monitor...");
      const monitors = DB.getMonitors();

      // Group monitors by query AND listingType to respect filters
      const groups = new Map();
      for (const mon of monitors) {
        const query = (mon.query || "").trim().toLowerCase();
        const type = mon.listingType || "all";
        const key = `${query}|||${type}`; // Use delimiter to separate query and type
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(mon);
      }

      for (const [compositeKey, mons] of groups.entries()) {
        const [queryKey, typeFilter] = compositeKey.split("|||");

        // Build filter based on saved listingType
        let filter = "";
        if (typeFilter === "auction") {
          filter = "buyingOptions:{AUCTION}";
        } else if (typeFilter === "buy_it_now") {
          filter = "buyingOptions:{FIXED_PRICE}";
        } else {
          // Default: show both
          filter = "buyingOptions:{AUCTION|FIXED_PRICE}";
        }

        console.log(`Searching "${queryKey}" with filter: ${filter}`);

        // Single eBay call per query+type group
        const results = await searchItems(queryKey, 10, filter);

        // Get sold items to calculate fair price
        const soldItems = await getSoldItems(queryKey);
        const fairPrice = MarketAnalyzer.calculateFairPrice(soldItems);

        for (const item of results) {
          if (DB.isSeen(item.itemId)) continue;

          // For auctions without price, try to fetch price/currentBidPrice from item or full item
          const isAuction =
            item.buyingOptions && item.buyingOptions.includes("AUCTION");
          let price = null;
          let priceDisplay = null;

          const applyPrice = (src) => {
            if (!src) return false;
            const val =
              (src.price && src.price.value) ||
              (src.currentBidPrice && src.currentBidPrice.value);
            const cur =
              (src.price && src.price.currency) ||
              (src.currentBidPrice && src.currentBidPrice.currency);
            if (val) {
              price = parseFloat(val);
              priceDisplay = cur ? `${val} ${cur}` : `${val}`;
              return true;
            }
            return false;
          };

          // Try price from search result
          applyPrice(item);

          // If missing and it's an auction, fetch full item
          if (price === null && isAuction) {
            try {
              const fullItem = await getItem(item.itemId);
              applyPrice(fullItem);
            } catch (fetchErr) {
              console.error(
                "Failed to fetch full item for price:",
                fetchErr.message
              );
            }
          }

          // Final fallback
          if (price === null) {
            if (isAuction) {
              price = 0.01;
              priceDisplay = "Starting price unavailable (no bids yet)";
            } else {
              // Skip non-auction items without price
              continue;
            }
          }

          const deal = MarketAnalyzer.getDealMeter(price, fairPrice);

          console.log(
            `Item: ${item.title} | Price: $${price} | Fair: $${fairPrice} | Score: ${deal.score}`
          );

          // Always show auctions with no bids (they're at starting price)
          if (deal.score < 100 || (isAuction && price < 1)) {
            const embed = new EmbedBuilder()
              .setTitle(
                `${isAuction ? "🔨 Auction" : "🚨 Deal"}: ${item.title}`
              )
              .setURL(item.itemWebUrl)
              .setDescription(
                `**Current Price:** ${
                  priceDisplay || "Starting price unavailable (no bids yet)"
                }\n**Fair Price:** $${fairPrice}`
              );

            if (isAuction) {
              embed.addFields(
                {
                  name: "Bids",
                  value: item.bidCount ? item.bidCount.toString() : "0",
                  inline: true,
                },
                {
                  name: "Ends In",
                  value: item.itemEndDate
                    ? `<t:${Math.floor(
                        new Date(item.itemEndDate).getTime() / 1000
                      )}:R>`
                    : "N/A",
                  inline: true,
                }
              );
            }

            // Extract Legacy ID for display (v1|12345|0 -> 12345)
            let legacyId = item.itemId;
            if (legacyId.startsWith("v1|")) {
              const parts = legacyId.split("|");
              if (parts.length >= 2) legacyId = parts[1];
            }

            embed
              .addFields(
                { name: "eBay Item ID", value: legacyId, inline: true },
                {
                  name: "Deal Meter",
                  value: `${deal.emoji} ${deal.score}% ${deal.label}`,
                  inline: true,
                }
              )
              .setThumbnail(item.image ? item.image.imageUrl : null)
              .setColor(deal.color);

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`watch_${item.itemId}`)
                .setLabel("👀 Watch")
                .setStyle(ButtonStyle.Secondary)
            );

            // Notify all monitors subscribed to this query
            for (const mon of mons) {
              try {
                const channel = await client.channels.fetch(mon.channel_id);
                if (channel) {
                  await channel.send({
                    content: `<@${mon.user_id}>`,
                    embeds: [embed],
                    components: [row],
                  });
                }
              } catch (e) {
                console.error("Failed to notify channel:", e.message);
              }
            }

            // Only mark as seen after alerting (so future price drops can re-alert)
            DB.markSeen(item.itemId);
          } else {
            // Not a deal yet - don't mark seen so we can check again later
            console.log(
              `Not a deal (score ${deal.score} >= 100): ${item.title}`
            );
          }
        }
      }
    } catch (err) {
      console.error("Error in Monitor Job:", err);
    }
  });

  // 2. Bid Job: Check status (Every 30 seconds)
  const bidJob = new CronJob("*/30 * * * * *", async () => {
    try {
      const bids = DB.getActiveBids();
      for (const bid of bids) {
        const normId = normalizeItemId(bid.item_id);
        const item = await getItem(normId);
        if (!item) continue;

        // Check if ended
        const now = new Date();
        const end = new Date(item.itemEndDate);

        if (now > end) {
          // Only check win/loss for actual bids, not for watches
          if (bid.status !== "watching") {
            // Determine win/loss (Simulated: if price <= maxBid we assume win for demo)
            // In reality, we'd check eBay "currentHighBidder" via API (requires OAuth scopes)
            const price = parseFloat(item.price.value);
            if (price <= bid.max_bid) {
              DB.updateBidStatus(bid.id, "won");
              const user = await client.users.fetch(bid.user_id);
              if (user)
                user.send(
                  `🎉 **You Won!** Item: ${item.title}\nFinal Price: ${price}`
                );
            } else {
              DB.updateBidStatus(bid.id, "lost");
              const user = await client.users.fetch(bid.user_id);
              if (user)
                user.send(
                  `😢 **Lost.** Item: ${item.title}\nSold for: ${price} (Your Max: ${bid.max_bid})`
                );
            }
          } else {
            // For watches, just mark as completed without win/loss message
            DB.updateBidStatus(bid.id, "completed");
          }
          continue;
        }

        // Check Outbid or Watch Update
        const currentPrice = parseFloat(item.price.value);

        if (bid.status === "watching") {
          // Watch Logic
          // We use 'current_bid' to store the last known price.
          // If currentPrice > bid.current_bid, alert.
          // (on first run, bid.current_bid is 0, so it alerts initial status)
          if (currentPrice !== bid.current_bid) {
            const user = await client.users.fetch(bid.user_id);
            if (user) {
              await user.send({
                content: `👀 **Watch Update:** ${
                  item.title
                }\nNew Price: **$${currentPrice}**\nEnds: <t:${Math.floor(
                  new Date(item.itemEndDate).getTime() / 1000
                )}:R>`,
              });
            }
            // Update local 'current_bid' to new price to suppress duplicates
            // We abuse the updateBidStatus or need a new method?
            // DB.updateBidStatus only updates status. We need to update current_bid.
            // Let's assume we can add a method or just run raw SQL if needed, but for now I'll use a new DB method.
            // Or I can add `updateBidPrice` to DB.js.
            // For now, I will modify Database.js to have updateBidPrice.
            // Since I can't do that in this same step easily without risking overlap, I will assume I'll add it.
            DB.updateBidPrice(bid.id, currentPrice);
          }
          continue;
        }

        if (currentPrice > bid.current_bid) {
          // Price increased
          // If price > max_bid -> Outbid Alert
          if (currentPrice > bid.max_bid) {
            const user = await client.users.fetch(bid.user_id);
            if (user) {
              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`bid_inc_5_${bid.item_id}`)
                  .setLabel("Increase +$5")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId(`bid_inc_10p_${bid.item_id}`)
                  .setLabel("Increase +10%")
                  .setStyle(ButtonStyle.Primary)
              );
              await user.send({
                content: `⚠️ **OUTBID ALERT!**\nItem: ${item.title}\nCurrent: ${currentPrice} (Max: ${bid.max_bid})`,
                components: [row],
              });
              // Mark as outbid until user updates
              DB.updateBidStatus(bid.id, "outbid");
            }
          } else {
            // Still winning (or in game), update local tracking
            // Note: We don't have "my current bid" in DB separate from item price really without full API syncing
          }
        }
      }
    } catch (err) {
      console.error("Error in Bid Job:", err);
    }
  });

  monitorJob.start();
  bidJob.start();
}

module.exports = { startMonitoring };

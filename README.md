# eBay Discord Bot

A powerful Discord bot for monitoring eBay listings, analyzing market prices, and tracking deals in real-time.

## Features

### 🔍 Market Monitoring

- **Search & Monitor**: Track eBay items with customizable filters (Auction, Buy It Now, or both)
- **Smart Alerts**: Get notified when new listings match your criteria
- **Price Analysis**: View average sold prices and market trends
- **Deal Meter**: Automatically identifies steals, good deals, and overpriced items

### 📊 Market Analytics

- **Fair Market Value (FMV)**: Calculates average prices from recent sold listings
- **Deal Scoring**: Visual rating system (🔥 STEAL, 🙂 Great Deal, 😐 Fair, 🛑 Overpriced)
- **Condition-based Filtering**: Filter by item condition (New, Used, etc.)

### 🤝 Trading Features

- **Trade Proposals**: Propose trades or sales to other users in the server
- **Accept/Decline System**: Interactive buttons for trade responses

### 🔐 eBay Authentication

- **OAuth Integration**: Secure eBay account linking via `/login` command
- **ngrok Tunneling**: Automatic public URL generation for OAuth callbacks
- **Account Management**: View linked accounts with `/logins` command

### 🛠️ Bot Management

- **Restart Command**: Admin/owner can restart the bot process
- **Clear Messages**: Bulk delete messages (with auto-delete after 5 seconds)
- **Watchlist Management**: View, add, and remove monitored items

## Commands

| Command                          | Description                          | Permissions     |
| -------------------------------- | ------------------------------------ | --------------- |
| `/monitor [query] [type]`        | Start monitoring an eBay search      | Everyone        |
| `/watchlist`                     | View active monitors in the channel  | Everyone        |
| `/remove_watchlist`              | Remove a monitor from your watchlist | Everyone        |
| `/trade [target] [item] [price]` | Propose a trade to another user      | Everyone        |
| `/login`                         | Link your eBay account via OAuth     | Everyone        |
| `/logins`                        | View all linked eBay accounts        | Everyone        |
| `/clear [amount]`                | Delete messages (1-100)              | Manage Messages |
| `/restart`                       | Restart the bot process              | Administrator   |
| `/ping`                          | Check bot latency                    | Everyone        |
| `/help`                          | View available commands              | Everyone        |

## Installation

### Prerequisites

- Node.js (v16 or higher)
- Discord Bot Token
- eBay Developer Account (App ID, Cert ID)
- ngrok (included in project)

### Setup

1. **Clone the repository**

```bash
cd c:\Users\sherv\Downloads\Discord
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
BOT_OWNER_ID=your_discord_user_id
CLIENT_ID=your_discord_application_id

# eBay API Configuration
EBAY_APP_ID=your_ebay_app_id
EBAY_CLIENT_SECRET=your_ebay_cert_id
EBAY_RU_NAME=your_redirect_uri_name
EBAY_REDIRECT_URI=https://your-ngrok-url/auth/ebay/callback

# ngrok Configuration (optional)
NGROK_AUTHTOKEN=your_ngrok_authtoken

# Restart Mode (optional)
RESTART_MODE=spawn
```

4. **Run the bot**

```bash
node index.js
```

The bot will automatically:

- Start the ngrok tunnel
- Display the public OAuth callback URL
- Connect to Discord
- Register slash commands

## Architecture

### File Structure

```
Discord/
├── index.js                    # Main bot entry point
├── package.json                # Dependencies
├── database.json               # JSON data storage
├── sqlite.db                   # SQLite database
├── .env                        # Environment variables
├── commands/                   # Slash commands
│   ├── monitor_config.js       # Monitor setup
│   ├── watchlist.js            # View monitors
│   ├── remove_watchlist.js     # Remove monitors
│   ├── trade.js                # Trade proposals
│   ├── login.js                # eBay OAuth
│   ├── logins.js               # View accounts
│   ├── clear_screen.js         # Message management
│   ├── restart.js              # Bot restart
│   ├── ping.js                 # Latency check
│   └── help.js                 # Command help
├── utils/                      # Core utilities
│   ├── Database.js             # SQLite wrapper
│   ├── ebay.js                 # eBay API integration
│   ├── MarketAnalyzer.js       # Price analysis
│   ├── auth_server.js          # OAuth server
│   ├── monitor.js              # Item monitoring
│   └── tracker.js              # Tracking system
└── ngrok-v3-stable-windows-amd64/  # ngrok executable
```

### Database Schema

**monitors**: Tracks active eBay searches

- `query`: Search term
- `max_price`: Optional price limit
- `condition`: Item condition filter
- `listingType`: Auction/Buy It Now/All
- `channel_id`: Discord channel
- `user_id`: Discord user

**seen_items**: Prevents duplicate alerts

- `item_id`: eBay item ID
- `seen_at`: Timestamp

**bids**: Automated bidding (placeholder)

- `item_id`: eBay item ID
- `user_id`: Discord user
- `max_bid`: Maximum bid amount

**logins**: eBay OAuth tokens

- `user_id`: Discord user
- `ebay_token`: Access token
- `refresh_token`: Refresh token
- `expires_at`: Token expiration

## How It Works

### 1. Monitoring Flow

1. User runs `/monitor [query]` command
2. Bot fetches current and sold eBay listings
3. Market analysis calculates FMV and deal scores
4. User selects condition filter via dropdown
5. Monitor is saved to database
6. Bot checks for new listings every interval
7. Alerts sent to channel when new items appear

### 2. OAuth Flow

1. User runs `/login` command
2. Bot generates eBay authorization URL with state parameter
3. User clicks link and authorizes on eBay
4. eBay redirects to ngrok callback URL
5. Auth server exchanges code for access token
6. Token stored in database linked to Discord user
7. Confirmation sent via DM

### 3. Deal Analysis

- Fetches sold listings for price history
- Calculates average (FMV)
- Compares current price to FMV
- Assigns score and visual indicator:
  - **< 85%**: 🔥 STEAL (Green)
  - **85-100%**: 🙂 Great Deal (Light Green)
  - **100-110%**: 😐 Fair (Yellow)
  - **> 120%**: 🛑 Overpriced (Red)

## Dependencies

```json
{
  "axios": "^1.13.2",
  "better-sqlite3": "^12.5.0",
  "cron": "^4.4.0",
  "discord.js": "^14.25.1",
  "dotenv": "^17.2.3",
  "ebay-api": "^9.4.0",
  "express": "^5.2.1"
}
```

## Configuration

### Bot Permissions Required

- Read Messages/View Channels
- Send Messages
- Embed Links
- Manage Messages (for clear command)
- Use Slash Commands

### eBay Developer Setup

1. Create app at [developer.ebay.com](https://developer.ebay.com)
2. Get App ID (Client ID) and Cert ID (Client Secret)
3. Configure OAuth Redirect URI (RuName):
   - URL: `https://your-ngrok-url/auth/ebay/callback`
   - Privacy Policy URL: Your privacy policy
4. Enable scopes: `https://api.ebay.com/oauth/api_scope`

### ngrok Setup

1. Sign up at [ngrok.com](https://ngrok.com)
2. Get authtoken from dashboard
3. Add to `.env` file
4. Bot will automatically configure and start tunnel

## Monitoring System

The bot runs periodic checks for monitored items:

- Configurable intervals (default: every few minutes)
- Fetches new listings matching saved queries
- Compares against `seen_items` database
- Sends rich embeds with:
  - Item title and image
  - Current price
  - Deal meter score
  - Direct link to listing
  - Condition badge

## Troubleshooting

### Bot Won't Start

- Check Discord token in `.env`
- Verify Node.js version (v16+)
- Ensure all dependencies are installed

### OAuth Callback Fails

- Verify ngrok is running
- Check callback URL in eBay Dev Portal
- Ensure `EBAY_RU_NAME` matches exactly
- Check ngrok tunnel URL hasn't changed

### Monitors Not Alerting

- Check monitor is active in database
- Verify channel still exists
- Check eBay API credentials
- Review console logs for errors

### Rate Limiting

- eBay API has rate limits
- Bot implements token caching
- Reduce monitor frequency if needed

## Future Enhancements

- [ ] Automated bidding system (placeholder exists)
- [ ] Price drop notifications
- [ ] Saved searches with email alerts
- [ ] Multi-server support
- [ ] Web dashboard
- [ ] Advanced filtering (shipping, seller rating)

## Security Notes

- Never commit `.env` file
- Keep Discord token private
- Rotate eBay credentials regularly
- Use environment variables for sensitive data
- Restrict admin commands to owner/admins

## License

ISC

## Support

For issues or questions, please check:

- eBay API Documentation: [developer.ebay.com/docs](https://developer.ebay.com/docs)
- Discord.js Guide: [discordjs.guide](https://discordjs.guide)
- ngrok Documentation: [ngrok.com/docs](https://ngrok.com/docs)

---

**Made with ❤️ for eBay deal hunters**

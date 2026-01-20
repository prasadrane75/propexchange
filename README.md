# Mini Marketplace (Flask + SQLite) with Claude Haiku 4.5 integration

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Environment (Claude Haiku 4.5)

Set these before running the app:

```bash
export CLAUDE_API_URL="https://api.your-claude-provider.com/v1/generate"
export CLAUDE_API_KEY="sk-...your-key..."
# (optional)
export CLAUDE_MODEL="claude-haiku-4.5"
```

## Run

```bash
python app.py
```

Open http://127.0.0.1:5000 in your browser.

## Features

- Browse items for sale with prices and quantities
- Sell items: list new items with title, description, price, quantity
- Buy items: click Buy to decrement quantity
- Generate descriptions: (on Sell form) click "Generate description" button to auto-fill description using Claude Haiku 4.5
- Flash messages confirm actions

## API Endpoints

- `GET /` — Browse items
- `GET/POST /sell` — Sell form / list new item
- `POST /buy/<item_id>` — Buy (decrement quantity)
- `POST /generate-description` — Generate item description (requires Claude env vars)

## Testing

Manual browser:
1. Visit http://127.0.0.1:5000
2. Click "Sell an item" and fill the form
3. Click "Generate description" (if Claude is configured)
4. List the item
5. Click "Buy" to test purchase

Quick curl checks:
```bash
# List (redirects to HTML):
curl http://127.0.0.1:5000/

# Buy item id=1:
curl -X POST http://127.0.0.1:5000/buy/1 -i

# Generate description (requires Claude env vars):
curl -s -X POST http://127.0.0.1:5000/generate-description \
  -H "Content-Type: application/json" \
  -d '{"title":"Vintage Clock","price":49.99}' | jq
```

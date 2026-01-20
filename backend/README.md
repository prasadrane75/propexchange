# Marketplace Backend (Node + Postgres)

## Setup

```bash
cd backend
cp .env.example .env
# update DATABASE_URL + JWT_SECRET
```

Initialize schema:

```bash
psql "$DATABASE_URL" -f schema.sql
```

Run the API:

```bash
npm install
npm run dev
```

## Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `GET /properties`
- `POST /properties` (seller/admin)
- `POST /properties/:id/investments` (buyer/admin)
- `GET /admin/users` (admin)


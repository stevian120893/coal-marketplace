# Coal Marketplace MVP

## Purpose

This is a private B2B coal trading portal.

The initial target users are existing coal traders/customers.

The goal is to simplify the existing WhatsApp-based coal ordering process.

## MVP Flow

Admin creates a coal listing.

Admin can associate a buyer with a secure magic link.

Buyer receives the link through WhatsApp.

Buyer opens the link without manually logging in.

Buyer can:

- View coal specifications
- View COA
- View coal photos
- Request a quotation

When a buyer submits a quotation request:

- The request is stored in the database.
- Admin receives a notification through email.
- Admin receives a WhatsApp notification.

Admin can:

- Manage buyers
- Manage coal listings
- Manage coal specifications
- Upload/manage COA
- Upload/manage photos
- View quotation requests
- View transactions
- Filter transactions
- Update transaction status

## MVP Scope

Included:

- Admin authentication
- Buyer management
- Coal listing CRUD
- Coal specifications
- COA upload
- Coal photo upload
- Secure buyer magic links
- Buyer coal detail page
- Request quotation
- Admin quotation management
- Transaction status management
- Email notification
- WhatsApp notification

Not included yet:

- Online payment
- Payment gateway
- Logistics tracking
- Open marketplace
- Trader-to-trader marketplace
- Mobile application
- Complex credit scoring
- Public registration

## Technology

Frontend:
- Next.js
- React
- TypeScript
- Tailwind CSS

Backend:
- Next.js server-side functionality / API

Database:
- PostgreSQL

ORM:
- Prisma

Architecture goal:

Keep the MVP simple, maintainable, and easy to migrate to another hosting provider later.
# BlogSpace · Backend

The REST API for BlogSpace, a full-stack blogging platform.

## Features

- Sign up and log in with email and password or with Google (Passport.js and JWT)
- Create, edit and delete blog posts
- Comments and likes
- User profiles and a personal dashboard
- Contact form emails through Nodemailer
- Rate limiting, Helmet security headers and input validation

## API routes

`/api/auth` · `/api/blogs` · `/api/comments` · `/api/users` · `/api/dashboard`

## Tech stack

Node.js · Express · MongoDB (Mongoose) · Passport.js · JWT · Nodemailer

## Run locally

```bash
npm install
```

Create a `.env` file with at least `MONGODB_URI`, `JWT_SECRET`, `SESSION_SECRET` and `FRONTEND_URL`. Google login also needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

```bash
npm run dev
```

The API runs on http://localhost:5000. The frontend is in [blogspace-1](https://github.com/aksharaagarwal21/blogspace-1).

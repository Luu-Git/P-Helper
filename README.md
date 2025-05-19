# Luu's P-Helper Project

This is a project for Luu's P-Helper. It is a web application that helps our Team coordinate better.

## Technologies used
This doesn't really matter, but is useful for the AI to understand more about this project. We are using the following technologies
- React with Next.js 14 App Router
- TailwindCSS
- Firebase Auth, Storage, and Database



## Environment Variables

The following environment variables are required for the notification system:

- `RESEND_API_KEY`: API key for the Resend email service
- `TEST_EMAIL`: Email address for testing in non-production environments
- `NEXT_PUBLIC_APP_URL`: Base URL of the application for email links
- `EMAIL_TEST_MODE`: Set to 'true' to redirect all emails to the test email in development
- `FORCE_TEST_EMAIL`: Set to 'true' to force all emails to go to TEST_EMAIL even in production
- `CRON_SECRET`: Secret key for Vercel Cron Job authentication

### Production Email Setup

For the initial deployment, all emails are configured to be sent to a single test email address.
To switch to sending emails to actual recipients:

1. Open the `.env.local` file (or environment variables in your Vercel project)
2. Change `FORCE_TEST_EMAIL=true` to `FORCE_TEST_EMAIL=false`
3. Deploy the application

This allows you to verify the email system in production before sending emails to real users.


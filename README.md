# Luu's P-Helper Project

This is a project for Luu's P-Helper. It is a web application that helps our Team coordinate better.

## Technologies used
This doesn't really matter, but is useful for the AI to understand more about this project. We are using the following technologies
- React with Next.js 14 App Router
- TailwindCSS
- Firebase Auth, Storage, and Database

## Notification System

The application includes an email notification system that handles various scenarios:

1. **NEW_TIME_SLOTS (1)**: When a professor creates new time slots
2. **TUTOR_SELECTED (2)**: When a professor selects a tutor for a time slot
3. **ALL_TUTORS_RESPONDED (3)**: When all tutors have provided their availability for a time slot
4. **TUTOR_ACKNOWLEDGED (4)**: When a tutor acknowledges that they've been selected
5. **PROFESSOR_NOTIFIED (5)**: When a professor is notified that a tutor has acknowledged their assignment

Notifications are collected and sent as daily digest emails to users.

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


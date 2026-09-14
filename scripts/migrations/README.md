# Database Schema & Migrations Reference

This directory contains standalone Supabase SQL Editor scripts and schema references. These files are not imported by the application code; they are purely for historical reference and documentation of database structure and Row Level Security (RLS) policies.

## Files Summary

### Core Schema & RLS
- **supabase_schema.sql**: Base database schema definitions for all primary tables.
- **supabase_rls_policies.sql**: Initial/Base Row Level Security (RLS) policies across core tables.
- **schema.json**: JSON snapshot/representation of the database schema for reference.

### Iterative Migrations
- **01_enable_rls.sql**: Enables RLS on specific newer or modified tables.
- **02_add_invoice_status.sql**: Migration to add status tracking fields for invoices.
- **supabase_migration_banners.sql**: Schema migration for the platform promotional banners feature.
- **supabase_migration_brand_cover.sql**: Migration for supporting brand profile cover images.
- **supabase_migration_chat_system_fixes.sql**: Fixes and structural updates for the real-time chat/messaging system.
- **supabase_migration_landing_content.sql**: Schema updates for customizable landing page content.
- **supabase_migration_maintenance.sql**: Schema for application maintenance mode state and toggles.
- **supabase_migration_onboarding_config.sql**: Adds/updates tables for user onboarding configurations and flows.
- **supabase_migration_otp.sql**: Schema required for OTP (One Time Password) based authentication.
- **supabase_migration_performance_rank.sql**: Adds fields/metrics for creator and brand performance ranking algorithms.
- **supabase_migration_portfolio_reviews.sql**: Schema updates for creator portfolios and the peer review system.
- **supabase_migration_rls_4_tables.sql**: Additional Row Level Security policies applied specifically to 4 newer tables.
- **supabase_migration_support_thread_id.sql**: Schema update to track support thread IDs in tickets.
- **supabase_migration_tags.sql**: Migration establishing the centralized categorization and tagging system.
- **supabase_migration_transactions.sql**: Schema additions for financial transactions, milestones, and escrow management.

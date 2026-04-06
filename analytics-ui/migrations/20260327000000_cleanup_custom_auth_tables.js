/**
 * Migration: cleanup_custom_auth_tables
 *
 * Removes tables that were used by the old custom JWT auth system.
 * These are no longer needed after migrating to NextAuth v4:
 *   - refresh_token: manual refresh token rotation (NextAuth handles session via JWT cookie)
 *   - oauth_state: custom OAuth PKCE/state storage (NextAuth handles this internally)
 *   - user_session: custom session tracking (replaced by NextAuth session-token cookie)
 */
exports.up = async (knex) => {
    await knex.schema.dropTableIfExists('refresh_token');
    await knex.schema.dropTableIfExists('oauth_state');
    await knex.schema.dropTableIfExists('user_session');
};

exports.down = async (knex) => {
    // Recreate tables for rollback if needed
    await knex.schema.createTableIfNotExists('refresh_token', (table) => {
        table.increments('id').primary();
        table.integer('user_id').notNullable();
        table.string('token_hash', 64).notNullable().unique();
        table.string('family_id', 36).notNullable();
        table.boolean('is_revoked').defaultTo(false);
        table.timestamp('expires_at').notNullable();
        table.string('ip_address', 45);
        table.string('user_agent', 512);
        table.timestamps(true, true);
    });

    await knex.schema.createTableIfNotExists('oauth_state', (table) => {
        table.increments('id').primary();
        table.string('state', 64).notNullable().unique();
        table.string('provider', 64).notNullable();
        table.string('code_verifier', 128);
        table.timestamp('expires_at').notNullable();
        table.timestamps(true, true);
    });

    await knex.schema.createTableIfNotExists('user_session', (table) => {
        table.increments('id').primary();
        table.integer('user_id').notNullable();
        table.string('session_token', 64).notNullable().unique();
        table.timestamp('expires_at').notNullable();
        table.timestamps(true, true);
    });
};

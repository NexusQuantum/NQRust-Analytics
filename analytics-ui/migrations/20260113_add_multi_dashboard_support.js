/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // Add new columns to dashboard table
    await knex.schema.alterTable('dashboard', (table) => {
        table.text('description').nullable().comment('Dashboard description');
        table
            .boolean('is_default')
            .defaultTo(false)
            .comment('Whether this is the default dashboard for the user');
        table
            .integer('created_by')
            .unsigned()
            .nullable()
            .references('id')
            .inTable('user')
            .onDelete('SET NULL')
            .comment('User who created the dashboard');
    });

    // Set existing dashboards to have a creator (first user)
    const firstUser = await knex('user').orderBy('id').first();
    if (firstUser) {
        await knex('dashboard').update({ created_by: firstUser.id });
    }

    // Set the first dashboard per project as default
    // Use SQLite-compatible syntax (no table alias in UPDATE)
    await knex.raw(`
    UPDATE dashboard
    SET is_default = 1
    WHERE id IN (
      SELECT MIN(d2.id)
      FROM dashboard d2
      GROUP BY d2.project_id, d2.created_by
    )
  `);

    // Create dashboard_share table for sharing dashboards with users
    await knex.schema.createTable('dashboard_share', (table) => {
        table.increments('id').primary();
        table
            .integer('dashboard_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('dashboard')
            .onDelete('CASCADE')
            .comment('Dashboard being shared');
        table
            .integer('user_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('user')
            .onDelete('CASCADE')
            .comment('User the dashboard is shared with');
        table
            .string('permission', 20)
            .notNullable()
            .defaultTo('view')
            .comment('Permission level: view or edit');
        table.timestamps(true, true);

        // Unique constraint: can only share with a user once
        table.unique(['dashboard_id', 'user_id']);
        table.index(['dashboard_id']);
        table.index(['user_id']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('dashboard_share');

    await knex.schema.alterTable('dashboard', (table) => {
        table.dropColumn('description');
        table.dropColumn('is_default');
        table.dropColumn('created_by');
    });
};

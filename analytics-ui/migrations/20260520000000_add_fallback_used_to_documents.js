/**
 * Adds a `fallback_used` flag to documents so the UI can show a
 * "limited structure" badge when PageIndex's TOC parser failed and we
 * fell back to a flat per-page tree.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('documents', (table) => {
    table.boolean('fallback_used').notNullable().defaultTo(false);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('documents', (table) => {
    table.dropColumn('fallback_used');
  });
};

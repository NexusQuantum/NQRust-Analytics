/**
 * Creates the `document_folders` table for hierarchical organization of
 * uploaded documents in the Document Library.
 *
 * Design:
 *   - Self-referencing `parent_folder_id` allows nesting (multi-level).
 *     NULL parent = root-level folder.
 *   - `created_by` references users so we can attribute ownership for
 *     audit, even though MVP grants workspace-wide visibility.
 *   - Application enforces max nesting depth and circular-reference
 *     prevention at the service layer (no DB-level constraints needed).
 *
 * Also adds `folder_id` to the `documents` table. NULL = uncategorized
 * (root-level), so existing documents are unaffected by this migration.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('document_folders', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table
      .integer('parent_folder_id')
      .nullable()
      .references('id')
      .inTable('document_folders')
      .onDelete('CASCADE'); // delete subtree if parent removed
    table.integer('created_by').nullable(); // FK soft — users table optional
    table.timestamps(true, true);

    table.index(['parent_folder_id']);
  });

  await knex.schema.alterTable('documents', (table) => {
    table
      .integer('folder_id')
      .nullable()
      .references('id')
      .inTable('document_folders')
      .onDelete('SET NULL'); // doc survives if folder deleted via move-to-parent strategy
    table.index(['folder_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('documents', (table) => {
    table.dropColumn('folder_id');
  });
  await knex.schema.dropTableIfExists('document_folders');
};

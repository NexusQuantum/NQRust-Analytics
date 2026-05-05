/**
 * Migration to create document table.
 *
 * Each document belongs to a notebook. Lifecycle status tracks the
 * async ingestion pipeline (parse -> embed -> ready). Hash enables
 * duplicate detection. qdrant_indexed_at tracks successful indexing.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('document', (table) => {
    table.increments('id').primary();
    table
      .integer('notebook_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('notebook')
      .onDelete('CASCADE')
      .comment('Notebook the document belongs to');
    table
      .string('filename')
      .notNullable()
      .comment('Display filename (sanitized)');
    table
      .string('original_filename')
      .notNullable()
      .comment('Filename as uploaded by user');
    table
      .string('storage_path')
      .notNullable()
      .comment('Relative path in storage backend');
    table.string('mime_type').notNullable();
    table.bigInteger('size').notNullable().comment('File size in bytes');
    table
      .string('hash', 64)
      .notNullable()
      .comment('SHA-256 hex digest of the file');
    table
      .integer('page_count')
      .nullable()
      .comment('Number of pages (set after parsing)');
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('uploading')
      .comment('uploading | parsing | embedding | ready | failed');
    table
      .text('error_message')
      .nullable()
      .comment('Last error message if status=failed');
    table
      .timestamp('qdrant_indexed_at')
      .nullable()
      .comment('When chunks were successfully written to Qdrant');
    table
      .integer('uploaded_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('user')
      .onDelete('SET NULL');
    table.timestamps(true, true);

    table.index(['notebook_id']);
    table.index(['notebook_id', 'hash']);
    table.index(['status']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('document');
};

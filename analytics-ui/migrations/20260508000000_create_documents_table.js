/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('documents', (table) => {
        table.string('id', 36).primary(); // UUID
        table.string('filename', 500).notNullable();
        table.string('original_filename', 500).notNullable();
        table.string('storage_path', 1000).notNullable();
        table.string('mime_type', 100).notNullable().defaultTo('application/pdf');
        table.bigInteger('size').notNullable(); // bytes
        table.string('hash', 64).notNullable(); // sha256 hex
        table.integer('page_count').nullable();
        table.string('status', 50).notNullable().defaultTo('pending');
        // status: pending | indexing | indexed | failed
        table.text('error_message').nullable();
        table.timestamp('indexed_at').nullable();
        table.timestamps(true, true);

        table.index(['hash']);
        table.index(['status']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('documents');
};

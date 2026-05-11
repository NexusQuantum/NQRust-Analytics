/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('document_selections', (table) => {
        table.increments('id').primary();
        table.string('document_id', 36).notNullable();
        table.timestamp('selected_at').defaultTo(knex.fn.now());

        table.foreign('document_id').references('documents.id').onDelete('CASCADE');
        table.unique(['document_id']);
        table.index(['document_id']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('document_selections');
};

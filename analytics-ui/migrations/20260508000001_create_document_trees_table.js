/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('document_trees', (table) => {
        table.increments('id').primary();
        table.string('document_id', 36).notNullable();
        table.text('tree_json').notNullable(); // PageIndex tree serialized as JSON
        table.string('model_used', 100).nullable();
        table.integer('build_time_ms').nullable();
        table.integer('version').notNullable().defaultTo(1);
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.foreign('document_id').references('documents.id').onDelete('CASCADE');
        table.index(['document_id']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('document_trees');
};

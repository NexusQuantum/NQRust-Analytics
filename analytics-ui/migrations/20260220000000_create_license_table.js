/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('license', (table) => {
        table.increments('id').primary();
        table.string('license_key', 255).notNullable();
        table.string('status', 50).notNullable().defaultTo('unknown');
        table.string('customer_name', 255).nullable();
        table.string('product', 255).nullable();
        table.string('product_id', 255).nullable();
        table.string('customer_id', 255).nullable();
        table.text('features').nullable();
        table.string('expires_at', 30).nullable();
        table.string('verified_at', 50).nullable();
        table.integer('activations').nullable();
        table.integer('max_activations').nullable();
        table.text('cached_response').nullable();
        table.string('device_id', 64).nullable();
        table.boolean('is_offline').notNullable().defaultTo(false);
        table.timestamps(true, true);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('license');
};

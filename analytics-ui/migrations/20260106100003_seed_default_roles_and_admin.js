const bcrypt = require('bcryptjs');

/**
 * Seed default roles, permissions, and admin user
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // Define permissions
    const resources = ['project', 'model', 'view', 'thread', 'dashboard', 'user', 'role', 'sql_pair', 'instruction'];
    const actions = ['read', 'write', 'delete', 'admin'];

    const permissions = [];
    for (const resource of resources) {
        for (const action of actions) {
            permissions.push({
                name: `${resource}:${action}`,
                resource,
                action,
                created_at: knex.fn.now(),
                updated_at: knex.fn.now(),
            });
        }
    }

    // Insert permissions
    await knex('permission').insert(permissions);

    // Get all permission IDs
    const allPermissions = await knex('permission').select('id', 'name');
    const permissionMap = Object.fromEntries(allPermissions.map(p => [p.name, p.id]));

    // Define roles
    const roles = [
        {
            name: 'admin',
            description: 'Full system access with all permissions',
            is_system: true,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
        },
        {
            name: 'editor',
            description: 'Can modify models, views, queries, and dashboards',
            is_system: true,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
        },
        {
            name: 'viewer',
            description: 'Read-only access to projects and data',
            is_system: true,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
        },
    ];

    // Insert roles
    await knex('role').insert(roles);

    // Get role IDs
    const insertedRoles = await knex('role').select('id', 'name');
    const roleMap = Object.fromEntries(insertedRoles.map(r => [r.name, r.id]));

    // Define role permissions
    const rolePermissions = [];

    // Admin gets all permissions
    for (const permId of Object.values(permissionMap)) {
        rolePermissions.push({
            role_id: roleMap['admin'],
            permission_id: permId,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
        });
    }

    // Editor permissions
    const editorResources = ['project', 'model', 'view', 'thread', 'dashboard', 'sql_pair', 'instruction'];
    const editorActions = ['read', 'write'];
    for (const resource of editorResources) {
        for (const action of editorActions) {
            const permName = `${resource}:${action}`;
            if (permissionMap[permName]) {
                rolePermissions.push({
                    role_id: roleMap['editor'],
                    permission_id: permissionMap[permName],
                    created_at: knex.fn.now(),
                    updated_at: knex.fn.now(),
                });
            }
        }
    }

    // Viewer permissions (read-only)
    const viewerResources = ['project', 'model', 'view', 'thread', 'dashboard'];
    for (const resource of viewerResources) {
        const permName = `${resource}:read`;
        if (permissionMap[permName]) {
            rolePermissions.push({
                role_id: roleMap['viewer'],
                permission_id: permissionMap[permName],
                created_at: knex.fn.now(),
                updated_at: knex.fn.now(),
            });
        }
    }

    // Insert role permissions
    await knex('role_permission').insert(rolePermissions);

    // Create default admin user
    // Password: admin123 (should be changed on first login)
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash('admin123', saltRounds);

    const [adminUser] = await knex('user').insert({
        email: 'admin@localhost',
        password_hash: passwordHash,
        display_name: 'Administrator',
        is_active: true,
        is_verified: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    }).returning('id');

    const adminUserId = adminUser.id || adminUser;

    // Assign admin role to admin user
    await knex('user_role').insert({
        user_id: adminUserId,
        role_id: roleMap['admin'],
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });

    // If there's an existing project, make admin user the owner
    const existingProject = await knex('project').first('id');
    if (existingProject) {
        await knex('project_member').insert({
            project_id: existingProject.id,
            user_id: adminUserId,
            role: 'owner',
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
        });
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    // Delete in reverse order to respect foreign keys
    await knex('project_member').del();
    await knex('user_role').del();
    await knex('user').del();
    await knex('role_permission').del();
    await knex('role').del();
    await knex('permission').del();
};

export const authDTO = (user) => ({
    id: user.id,
    username: user.username,
    role: user.role.name,
    hierarchy_level: user.role.hierarchy_level
});
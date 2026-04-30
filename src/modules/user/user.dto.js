export const userResponseDTO = (user) => ({
    id: user.id,
    fullname: user.fullname,
    username: user.username,
    role: user.role?.name,
    hierarchy_level: user.role?.hierarchy_level,
    is_active: user.is_active
});
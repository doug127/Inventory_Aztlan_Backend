export const shouldIncludeInactiveProducts = 
    (currentUser) => currentUser?.hierarchy_level >= 3;
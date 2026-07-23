export const shouldIncludeInactive = 
    (currentUser) => currentUser?.hierarchy_level >= 3;
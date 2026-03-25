export const authorizePrivilege = (privilegeName) => {
  return (req, res, next) => {
    const hasPrivilege = req.user.privileges.some(
      p => p.name === privilegeName
    );

    if (!hasPrivilege) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    next();
  };
};

export const authorizeHierarchy = (minLevel) => {
  return (req, res, next) => {
    const maxHierarchy = Math.max(
      ...req.user.privileges.map(p => p.hierarchy)
    );

    if (maxHierarchy < minLevel) {
      return res.status(403).json({
        message: 'Nivel de privilegio insuficiente'
      });
    }

    next();
  };
};
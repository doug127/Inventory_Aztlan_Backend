import { Role } from '#src/database/models/index.model.js';

export const authorizeRole = (minRoleName) => {
  return async (req, res, next) => {
    try {
      const minRole = await Role.findOne({
        where: { name: minRoleName }
      });

      if (!minRole) {
        return res.status(500).json({
          message: 'Rol requerido no existe'
        });
      }

      const userHierarchy = req.user?.hierarchy_level ?? req.user?.role?.hierarchy_level;

      if (userHierarchy === undefined || userHierarchy < minRole.hierarchy_level) {
        return res.status(403).json({
          message: 'Acceso denegado'
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
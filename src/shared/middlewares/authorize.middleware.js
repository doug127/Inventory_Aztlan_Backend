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

      const userHierarchy = req.user?.role?.hierarchy;

      if (userHierarchy < minRole.hierarchy) {
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
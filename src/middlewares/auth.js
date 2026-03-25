import jwt from 'jsonwebtoken';

export const auth = (req, res, next) => {
  const token = req.cookies.session;

  if (!token) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Sesión inválida' });
  }
};

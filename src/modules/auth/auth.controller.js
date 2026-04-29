import { login } from './auth.service.js';

export const loginController = async (req, res) => {
    try {
        const { username, password } = req.body;

        const { user, token } = await login(username, password);
        
        const loginDTO = {
            id: user.id,
            username: user.username,
            role: user.role.name,
            hierarchy_level: user.role.hierarchy_level
        };
        res
            .cookie('session', token, {
                httpOnly: true,
                sameSite: 'lax',
                secure: false,
                maxAge: 1000 * 60 * 60 // 1 hour
            })
            .json({ 
                message: 'Login exitoso', 
                user: loginDTO
            });        
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};

export const me = (req, res) => {
    if (req.user) {
        const userDTO = {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role,
            hierarchy_level: req.user.hierarchy_level
        };
        res.json({ user: userDTO });
    } else {
        res.status(401).json({ error: 'No autenticado' });
    }
};

export const logoutController = (req, res) => {
    res.clearCookie('session', {
        httpOnly: true,
        sameSite: 'lax',
        secure: false
    });

    res.status(200).json({ message: 'Sesión Cerrada' });
}
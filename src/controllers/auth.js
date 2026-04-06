import { login } from '../services/auth.js';

export const loginController = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await login(username, password);
        res
            .cookie('session', user.token, {
                httpOnly: true,
                sameSite: 'lax',
                secure: false,
                maxAge: 1000 * 60 * 60 // 1 hour
            })
            .json({ 
                message: 'Login exitoso', 
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            });        
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};

export const me = (req, res) => {
    if (req.user) {
        console.log('Authenticated user:', req.user);
        res.json({ 
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        });
    } else {
        res.status(401).json({ error: 'No autenticado' });
    }
};

export const logoutController = (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('session', {
            httpOnly: true,
            sameSite: 'lax',
            secure: false
        });

        res.status(200).json({ message: 'Sesión Cerrada' });
    });
}
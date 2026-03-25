import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { findUserByUsername } from '../repositories/user.js';

export const login = async (username, password) => {    
    const user = await findUserByUsername(username);

    if (!user || !user.is_active) {    
        throw new Error('Usuario no Encontrado');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {    
        throw new Error('Credenciales Inválidas');
    }

    const token = jwt.sign(
        { 
            id: user.id, 
            username: user.username, 
            role: user.role.name,
            privileges: user.role.privileges.map(p => ({
                name: p.name,
                hierarchy: p.hierarchy,
                description: p.description
            }))
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    return { ...user.get(), token };
};
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { findUserByUsername } from '../user/user.repository.js';
import { authDTO } from './auth.dto.js';

export const login = async (username, password) => {    
    const user = await findUserByUsername(username);

    if (!user || !user.is_active) {    
        throw new Error('Usuario no Encontrado');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {    
        throw new Error('Credenciales Inválidas');
    }

    const payload = authDTO(user);

    const token = jwt.sign( payload, process.env.JWT_SECRET, { 
        expiresIn: '1h' 
    });

    return { user: payload, token };
};
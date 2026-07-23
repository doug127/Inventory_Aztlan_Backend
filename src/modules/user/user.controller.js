import {
    getAllUsersService,
    getUserByIdService,
    createUserService,
    updateUserService,
    deleteUserService
} from './user.service.js';

export const getUsersController = async (req, res) => {
    try {
        const users = await getAllUsersService(req.query, req.user);
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getUserByIdController = async (req, res) => {
    try {
        const user = await getUserByIdService(req.params.id);
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createUserController = async (req, res) => {
    try {
        const newUser = await createUserService({
            data: req.validatedData,
            currentUser: req.user
        });
 
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateUserController = async (req, res) => {
    try {
        const updatedUser = await updateUserService({
            id: req.params.id,
            data: req.validatedData,
            currentUser: req.user
        });
        res.status(200).json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteUserController = async (req, res) => {
    try {
        const userId = req.user.id;
        
        await deleteUserService(req.params.id, userId);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


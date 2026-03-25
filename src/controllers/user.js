import {
    getAllUsers,
    createUser as createUserService,
    updateUser as updateUserService,
    deleteUser as deleteUserService
} from '../services/user.js';

export const getUsersController = async (req, res) => {
    try {
        const users = await getAllUsers();
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createUserController = async (req, res) => {
    try {
        const newUser = await createUserService({
            data: req.body,
            currentUser: req.user
        });

        const { password, ...userWithoutPassword } = newUser.toJSON();
        res.status(201).json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateUserController = async (req, res) => {
    try {
        const updatedUser = await updateUserService({
            id: req.params.id,
            data: req.body,
            currentUser: req.user
        });
        res.status(200).json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteUserController = async (req, res) => {
    try {
        await deleteUserService(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


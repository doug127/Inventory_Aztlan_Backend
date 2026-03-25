import { sequelize } from '../src/config/database.js';

export const runServer = async (app) => {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Unable to connect to the database:', error);
    }
}
export const validateUsername = (username) => {
    if(!username) {
        throw new Error('El nombre de usuario es obligatorio');
    }
    if(username.length < 3) {
        throw new Error('El nombre de usuario debe tener al menos 3 caracteres');
    }
    if(username.length > 30) {
        throw new Error('El nombre de usuario no debe exceder los 30 caracteres');
    }
    if(username.includes(' ')) {
        throw new Error('El nombre de usuario no debe contener espacios');
    }
}

export const validateFullname = (fullname) => {
    if(!fullname) {
        throw new Error('El nombre completo es obligatorio');
    }
    if(fullname.length < 3) {
        throw new Error('El nombre completo debe tener al menos 3 caracteres');
    }
    if(fullname.length > 100) {
        throw new Error('El nombre completo no debe exceder los 100 caracteres');
    }
    if(fullname.includes('  ')) {
        throw new Error('El nombre completo no debe contener espacios dobles');
    }
    if(!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]+$/.test(fullname)) {
        throw new Error('El nombre completo solo debe contener letras y espacios');
    }
    if(fullname.trim().split(' ').length < 2) {
        throw new Error('El nombre completo debe contener al menos un nombre y un apellido');
    }
}

export const validatePassword = (password) => {
    if(!password) {
        throw new Error('La contraseña es obligatoria');
    }
    if(password.length < 8) {
        throw new Error('La contraseña debe tener al menos 8 caracteres');
    }
    if(password.length > 100) {
        throw new Error('La contraseña no debe exceder los 100 caracteres');
    }
    if(password.includes(' ')) {
        throw new Error('La contraseña no debe contener espacios');
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.,-_])[A-Za-z\d@$!%*?&.,-_]{8,}$/;
        
    if(!password.match(passwordRegex)) {
        throw new Error('La contraseña debe tener al menos 8 caracteres, una letra mayúscula, una letra minúscula, un número y un carácter especial');
    }
}
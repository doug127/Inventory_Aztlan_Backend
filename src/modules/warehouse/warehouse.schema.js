export const validateWarehouseData = ({ name, code, existingWarehouse }) => {
    if (existingWarehouse) {
        throw new Error('Ya existe un almacen con ese nombre');
    }   
    if(name.length < 3 || name.length > 50){
        throw new Error('El nombre del almacen debe tener entre 3 y 50 caracteres');
    }
    if(!name.match(/^[A-Za-z0-9\s]+$/)){
        throw new Error('El nombre del almacen solo puede contener letras, numeros y espacios');
    }
    if(code.length !== 4){
        throw new Error('El codigo del almacen debe tener exactamente 4 caracteres');
    }
    if(code.includes(' ')){
        throw new Error('El codigo del almacen no puede contener espacios');
    }
    if(!/^[A-Z0-9]{4}$/.test(code)){
        throw new Error('El codigo del almacen debe tener 4 caracteres alfanumericos en mayusculas');
    }
    if(code.length !== 4){
        throw new Error('El codigo del almacen debe tener exactamente 4 caracteres');
    }
}
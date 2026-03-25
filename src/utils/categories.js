export const categories = [
    {
        name: 'Químicos',
        description: 'Categoria de productos químicos para venenos y limpieza agrícola',
        parent_id: null
    },
    {
        name: 'Herramientas',
        description: 'Categoria de productos para herramientas de jardinería e implementos agrícolas',
        parent_id: null
    },
    {
        name: 'Derivados del Petróleo',
        description: 'Categoria de productos para combustibles y lubricantes',
        parent_id: null
    },
    {
        name: 'Combustibles',
        description: 'Categoria de productos para combustibles',
        parent_id: 3
    },
    {
        name: 'Lubricantes',
        description: 'Categoria de productos para lubricantes',
        parent_id: 3
    },
    {
        name: 'Abonos y Fertilizantes',
        description: 'Categoria de productos para fertilizantes y nutrientes de plantas',
        parent_id: 1
    },
    {
        name: 'Venenos e Insecticidas',
        description: 'Categoria de productos para control de insectos y plagas',
        parent_id: 1
    },
    {
        name: 'Herbicidas',
        description: 'Categoria de productos para control de malezas',
        parent_id: 1
    },
    {
        name: 'Coadyuvantes',
        description: 'Categoria de productos para coadyuvantes agrícolas',
        parent_id: 1    
    },
    {
        name: 'Implementos de Jardinería',
        description: 'Categoria de productos para herramientas manuales de jardinería',
        parent_id: 2
    },
    {
        name: 'Herramientas Eléctricas',    
        description: 'Categoria de productos para herramientas eléctricas de jardinería',
        parent_id: 2
    }
]
export const productDTO = (product) => {
    const p = product.get ? product.get() : product;

    return {
        id: p.id,
        name: p.name,
        code: p.code,
        content_quantity: p.content_quantity,
        min_stock: p.min_stock,
        max_stock: p.max_stock,
        is_active: p.is_active,

        unit: p.unit ? {
            id: p.unit.id,
            name: p.unit.name,
            code: p.unit.code
        } : null,

        category_product: p.category_product ? {
            id: p.category_product.id,
            name: p.category_product.name
        } : null
    };
};
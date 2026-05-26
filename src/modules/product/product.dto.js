export const productDTO = (product) => {
    const p = product.get ? product.get() : product;

    return {
        name: p.name,
        code: p.code,
        content_quantity: p.content_quantity,
        min_stock: p.min_stock,
        max_stock: p.max_stock,
        is_active: p.is_active,

        unit: p.unit ? {
            name: p.unit.name,
            code: p.unit.code
        } : null,

        category_product: p.category_product ? {
            name: p.category_product.name
        } : null
    };
};
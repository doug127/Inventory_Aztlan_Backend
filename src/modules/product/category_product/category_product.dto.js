export const categoryProductDTO = (
    category,
    ancestors = [],
    descendants = []
) => {

    const c = category.get
        ? category.get()
        : category;

    return {
        id: c.id,
        name: c.name,

        ancestors: ancestors.map(a => ({
            id: a.id,
            name: a.name,
        })),

        descendants: descendants.map(d => ({
            id: d.id,
            name: d.name,
        })),
    };
};
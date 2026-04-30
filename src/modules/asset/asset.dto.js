export const assetDTO = (asset) => {
    const a = asset.get ? asset.get() : asset;

    return {
        id: a.id,
        name: a.name,
        assetTypeId: a.assetTypeId,
        assetType: a.asset_type ? {
            id: a.asset_type.id,
            name: a.asset_type.name,
            description: a.asset_type.description,
            active: a.asset_type.active
        } : null
    };
};
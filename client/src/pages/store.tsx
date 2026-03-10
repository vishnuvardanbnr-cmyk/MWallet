import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Package, Loader2, Store, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HardwareProduct } from "@shared/schema";

export default function StorePage() {
  const { data: products, isLoading, error } = useQuery<HardwareProduct[]>({
    queryKey: ["/api/hardware/products"],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-store-title">
          Hardware Store
        </h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-store-subtitle">Browse and purchase hardware wallets and mining devices</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20" data-testid="status-loading">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-300" />
        </div>
      )}

      {error && (
        <div className="glass-card rounded-2xl p-8 text-center" data-testid="status-error">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-muted-foreground">Failed to load products</p>
        </div>
      )}

      {!isLoading && !error && products && products.length === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center" data-testid="status-empty">
          <Store className="w-16 h-16 text-yellow-300/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-display)' }}>No Products Available</h3>
          <p className="text-sm text-muted-foreground">Products will appear here once they are added by the admin.</p>
        </div>
      )}

      {!isLoading && products && products.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="grid-products">
          {products.map((product) => (
            <div key={product.id} className="glass-card rounded-2xl overflow-hidden border border-yellow-600/10" data-testid={`card-product-${product.id}`}>
              {product.image && (
                <div className="aspect-video bg-black/20 flex items-center justify-center overflow-hidden">
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" data-testid={`img-product-${product.id}`} />
                </div>
              )}
              {!product.image && (
                <div className="aspect-video bg-gradient-to-br from-yellow-600/10 to-amber-400/10 flex items-center justify-center">
                  <Package className="w-12 h-12 text-yellow-300/40" />
                </div>
              )}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-product-name-${product.id}`}>{product.name}</h3>
                  {product.inStock ? (
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs shrink-0" data-testid={`status-stock-${product.id}`}>In Stock</Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-400 border-red-500/30 text-xs shrink-0" data-testid={`status-stock-${product.id}`}>Out of Stock</Badge>
                  )}
                </div>
                {product.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-product-desc-${product.id}`}>{product.description}</p>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-product-price-${product.id}`}>
                    ${product.price.toLocaleString()}
                  </span>
                  <Badge variant="outline" className="text-yellow-300 border-yellow-600/30 text-xs" data-testid={`text-product-category-${product.id}`}>
                    {product.category}
                  </Badge>
                </div>
                <Button
                  className="w-full"
                  disabled={!product.inStock}
                  data-testid={`button-buy-${product.id}`}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  {product.inStock ? "Buy Now" : "Unavailable"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import type { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";

/**
 * Persist the react-query cache to localStorage so every tab keeps working
 * offline with the last data it saw.
 */
export function setupQueryPersistence(queryClient: QueryClient) {
  if (typeof window === "undefined") return;
  try {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: "bz_query_cache",
      throttleTime: 1000,
    });
    persistQueryClient({
      queryClient: queryClient as never,
      persister,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      dehydrateOptions: {
        shouldDehydrateQuery: (q) => q.state.status === "success",
      },
    });
  } catch {
    /* storage full / disabled — app still works online */
  }
}

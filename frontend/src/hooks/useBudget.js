import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../utils/api';

export function useBudget({ brand, month }) {
  return useQuery({
    queryKey: ['budget', brand, month],
    queryFn: () => fetchApi('/api/budget', { brand, month }),
    enabled: !!month,
    placeholderData: (prev) => prev,
  });
}

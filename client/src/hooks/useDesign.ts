import { useCallback, useState } from 'react';

type Design = 'mastro' | 'quadro';

export function useDesign() {
  // The inline bootstrap script in index.html already resolved this from localStorage
  // before React mounted, so reading the dataset here avoids a flash of the wrong design.
  const [design, setDesign] = useState<Design>(() => {
    const current = document.documentElement.dataset.design;
    return current === 'mastro' || current === 'quadro' ? current : 'mastro';
  });

  const commutaDesign = useCallback(() => {
    setDesign((prev) => {
      const next: Design = prev === 'mastro' ? 'quadro' : 'mastro';
      document.documentElement.dataset.design = next;
      localStorage.setItem('portfolia-design', next);
      return next;
    });
  }, []);

  return { design, commutaDesign };
}

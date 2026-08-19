import { useCallback, useState } from 'react';

type Tema = 'scuro' | 'chiaro';

export function useTema() {
  // The inline bootstrap script in index.html already resolved this from localStorage
  // before React mounted, so reading the dataset here avoids a flash of the wrong theme.
  const [tema, setTema] = useState<Tema>(() => {
    const current = document.documentElement.dataset.tema;
    return current === 'scuro' || current === 'chiaro' ? current : 'scuro';
  });

  const commutaTema = useCallback(() => {
    setTema((prev) => {
      const next: Tema = prev === 'scuro' ? 'chiaro' : 'scuro';
      document.documentElement.dataset.tema = next;
      localStorage.setItem('portfolia-tema', next);
      return next;
    });
  }, []);

  return { tema, commutaTema };
}

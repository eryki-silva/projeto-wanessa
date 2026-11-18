# Compasso

Planejamento de jornadas e escalas com React, TypeScript e API Express.

## Executar localmente

```sh
npm ci
npm run build
npm start
```

Acesse http://127.0.0.1:4173. O comando `node server.cjs` também inicia a versão compilada.

Para desenvolver, use dois terminais: `npm run api` e `npm run dev`. Frontend na porta 4180; API na 4181.

## Estrutura

- `frontend/`: interface React, CSS, estado, cliente HTTP e migração de backups.
- `backend/`: API, validação, cálculos e relatórios. Não contém páginas.
- `shared/`: contratos TypeScript.
- `api/index.ts`: entrada da API para a Vercel.
- `public/legacy/`: versão anterior preservada, disponível em `/legacy/index.html`.
- `scripts/serve.ts`: servidor local da versão compilada.

## Publicação na Vercel

Importe o repositório usando a raiz do projeto. O `vercel.json` configura Vite, `npm ci`, `npm run build`, saída `dist` e a API no mesmo domínio. Não use a pasta de demonstração `preview-react` como Root Directory.

## Dados e backups

Os dados continuam salvos por navegador e endereço, sem sincronização entre dispositivos. A API é stateless: recebe os parâmetros para calcular e exportar; não armazena os cadastros.

Na primeira abertura, a nova versão importa os dados antigos do mesmo endereço para `compasso-v2`, mantendo `compasso-v1` intacto. Backups antigos e novos podem ser restaurados. Para mudar de computador ou endereço, exporte o backup e restaure no destino.

Arquivos inválidos não substituem os dados atuais. Se o armazenamento estiver indisponível, o aplicativo sinaliza que é preciso exportar o backup.

## Funcionalidades

- Jornada semanal 5×2, 6×1 e alternância 12×36, com as quatro batidas e avanço por Enter.
- Seleção de trabalho ou folga em cada dia da jornada semanal, com avisos quando a quantidade não corresponde ao padrão escolhido. A seleção é salva no navegador e nos backups e aparece nos relatórios.
- Horas diurnas, noturnas reais ou reduzidas, totais e comparação com a meta.
- Filiais, setores, colaboradores e horários/limites individuais.
- Escala mensal com fechamentos, folgas proporcionais em semanas parciais, domingos alternados e continuidade do mês anterior quando salvo.
- Ajustes manuais de trabalho/folga, alertas de cobertura diária, horas semanais e descanso entre jornadas.
- Excel XLSX e CSV separados por relatório; impressão da jornada semanal ou escala mensal.
- No Excel semanal, as batidas são horários numéricos e as horas diurnas, noturnas e os totais usam fórmulas editáveis. O formato de duração preserva totais acima de 24 horas. O CSV continua exportando valores estáticos.

O gerador é heurístico. Os alertas precisam de conferência; cobertura por faixa de horário não é validada. 12×36 alterna dias e não valida a duração contratual nem garante 36 horas exatas de descanso para qualquer horário digitado. A redução noturna cobre apenas 22h–5h, desconta intervalos e não se estende após as 5h. Os cálculos são de tempo, não de adicional salarial.

## Verificação

`npm run build` verifica os tipos e compila a interface. `npm test` verifica jornadas, virada de mês, alterações manuais, regras, relatórios e compatibilidade de backups.
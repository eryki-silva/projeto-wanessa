# Compasso

Ferramenta pessoal de planejamento de escalas por filial e setor. Abra `index.html` no navegador ou execute `node server.cjs` e acesse http://127.0.0.1:4173.

Dados ficam no navegador. Exporte backups regularmente; restaurar substitui os dados atuais. Exportação de relatórios em CSV (Excel) e impressão/PDF pelo navegador.

O gerador usa distribuição heurística de folgas, semanas de segunda a domingo e domingos alternados para mulheres quando configurado. Não é um solucionador completo: pode apresentar conflitos mesmo se outra combinação for possível. Os alertas devem ser conferidos. Semanas parciais têm folgas proporcionais. O mês anterior salvo contribui para a validação dos dias consecutivos, domingos e intervalo na virada. Alterações de regras ou pessoas invalidam a escala do mês selecionado; meses antigos são conservados e devem ser gerados novamente para atualizar os resultados.

Hora noturna urbana: 22h–5h, fator 8/7, apenas sobre os trechos trabalhados, sem intervalo. Não aplica redução após as 5h nem calcula remuneração, adicional noturno ou hora extra em dinheiro. Não cobre convenções coletivas específicas, escalas 12x36, afastamentos individuais, feriados por município ou cobertura mínima por horário. O mínimo informado é de pessoas por dia. Não promete conformidade trabalhista automática.

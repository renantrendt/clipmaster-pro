# Chrome Web Store Publication Checklist

## 1. Manifest.json Updates
- [ ] Adicionar ícones (16x16, 48x48, 128x128)
- [ ] Remover URLs de desenvolvimento (localhost)
- [ ] Adicionar campo `author`
- [ ] Adicionar `homepage_url`
- [ ] Revisar permissões necessárias
- [ ] Atualizar versão se necessário

## 2. Assets para Chrome Web Store
- [ ] Screenshots da extensão (mínimo 1, máximo 5)
- [ ] Ícone promocional pequeno 440x280px
- [ ] Descrição curta (máximo 132 caracteres)
- [ ] Descrição detalhada
- [ ] Pelo menos 2 screenshots da extensão em uso
- [ ] Vídeo promocional (opcional)

## 3. Documentação
- [ ] Criar política de privacidade
- [ ] Documentar como a IA é utilizada
- [ ] Instruções de uso claras
- [ ] Termos de serviço (se aplicável)

## 4. Segurança
- [ ] Verificar exposição de chaves de API
- [ ] Implementar rate limiting na edge function
- [ ] Remover console.logs de produção
- [ ] Testar todos os fluxos de erro
- [ ] Verificar CORS e segurança

## 5. Testes
- [ ] Testar em diferentes sites
- [ ] Verificar consumo de memória
- [ ] Testar em diferentes versões do Chrome
- [ ] Validar todos os recursos premium
- [ ] Testar edge function em produção

## 6. Preparação Final
- [ ] Criar conta de desenvolvedor na Chrome Web Store (se ainda não tiver)
- [ ] Pagar taxa única de desenvolvedor ($5)
- [ ] Criar ZIP com todos os arquivos necessários
- [ ] Remover arquivos desnecessários do ZIP (node_modules, etc)
- [ ] Verificar se o tamanho do ZIP está dentro do limite

## 7. Pós-publicação
- [ ] Monitorar uso da edge function
- [ ] Configurar alertas de erro
- [ ] Preparar plano de suporte ao usuário
- [ ] Configurar analytics (opcional)

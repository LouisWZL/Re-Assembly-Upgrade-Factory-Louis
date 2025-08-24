import ClientPage from './client-page'

export default async function FactoryConfigurator({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params
  
  return <ClientPage factoryId={id} />
}
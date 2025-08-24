'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings, Package, Box, Workflow } from 'lucide-react'
import { useFactory } from '@/contexts/factory-context'

export function ConfiguratorWelcome() {
  const { activeFactory } = useFactory()
  const sections = [
    {
      icon: Settings,
      title: 'Fabrikeinstellungen',
      description: 'Konfigurieren Sie die Kapazität Ihrer Re-Assembly Factory sowie das Schichtmodell und die Montagestationen.',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      icon: Package,
      title: 'Produkte',
      description: 'Erstellen Sie Produkte mit Basis- und Premiumvarianten für Ihre Produktionslinien.',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
    },
    {
      icon: Box,
      title: 'Baugruppen',
      description: 'Verwalten Sie Baugruppentypen und einzelne Baugruppen für Ihre Produkte.',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    },
    {
      icon: Workflow,
      title: 'Prozesse',
      description: 'Ordnen Sie den vorhandenen Produkten die entsprechenden Baugruppentypen zu und definieren Sie Prozessabläufe.',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    },
  ]

  return (
    <div className="flex flex-col h-full p-8">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Willkommen im Factory Configurator
          </h1>
          <p className="text-lg text-muted-foreground">
            Nutzen Sie das Menü auf der linken Seite, um Ihre Re-Assembly Factory zu konfigurieren.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <Card key={section.title} className="border-2 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg ${section.bgColor}`}>
                      <Icon className={`h-6 w-6 ${section.color}`} />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl">{section.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {section.description}
                  </CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="mt-8 p-6 bg-muted/30 rounded-lg">
          <h3 className="font-semibold mb-2">Erste Schritte:</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Beginnen Sie mit den <strong>Fabrikeinstellungen</strong> um die Grundkonfiguration festzulegen</li>
            <li>Erstellen Sie Ihre <strong>Produkte</strong> mit verschiedenen Varianten</li>
            <li>Definieren Sie <strong>Baugruppen</strong> für Ihre Produktkomponenten</li>
            <li>Nutzen Sie den <strong>Prozesse</strong> Bereich für die Prozessmodellierung mit JointJS</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
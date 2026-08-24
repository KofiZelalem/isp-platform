import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { AlertCircle, ArrowRight, Clock, Download, Upload, Wifi } from "lucide-react"

export default function CustomerHomePage() {
  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, John!</h1>
          <p className="text-muted-foreground">Manage your internet service and view your usage.</p>
        </div>
        <Badge variant="default" className="w-fit text-sm px-3 py-1 font-medium shadow-sm bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">
          <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse" />
          Status: Online
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="col-span-1 md:col-span-2 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 shadow-sm backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl">Premium Home</CardTitle>
            <CardDescription>Your current subscription package</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-6 sm:items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center shadow-sm">
                    <Download className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Download</div>
                    <div className="text-2xl font-bold">100 <span className="text-sm font-normal text-muted-foreground">Mbps</span></div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center shadow-sm">
                    <Upload className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Upload</div>
                    <div className="text-2xl font-bold">50 <span className="text-sm font-normal text-muted-foreground">Mbps</span></div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-background/40 border-t border-primary/10 p-4">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center text-sm text-muted-foreground">
                <Clock className="mr-2 h-4 w-4" />
                Renews on Sept 1, 2026
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                Change Package <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>

        <Card className="col-span-1 shadow-sm backdrop-blur-sm border-border/50 bg-background/50">
          <CardHeader>
            <CardTitle>Data Usage</CardTitle>
            <CardDescription>Current billing cycle</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div className="text-3xl font-bold">428 <span className="text-lg font-normal text-muted-foreground">GB</span></div>
              <div className="text-sm text-muted-foreground mb-1">of Unlimited</div>
            </div>
            <Progress value={65} className="h-2" />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Note: Speeds may throttle after 1000 GB
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-sm backdrop-blur-sm border-border/50 bg-background/50">
          <CardHeader>
            <CardTitle>Connected Devices</CardTitle>
            <CardDescription>Devices currently using your network</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <Wifi className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Main Router (TP-Link)</div>
                    <div className="text-xs text-muted-foreground">Online • 192.168.1.1</div>
                  </div>
                </div>
                <Badge variant="outline">Gateway</Badge>
              </div>
              
              {/* Additional devices placeholder */}
              <div className="pt-4 flex justify-center border-t border-border/50">
                <Button variant="link" className="text-muted-foreground text-sm">View all 12 connected devices</Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm backdrop-blur-sm border-border/50 bg-background/50">
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
            <CardDescription>Your latest billing statements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">INV-2026-08</p>
                  <p className="text-sm text-muted-foreground">Aug 1, 2026</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="font-medium">$49.99</div>
                  <Badge variant="outline" className="text-green-600 border-green-600/20 bg-green-500/10 hover:bg-green-500/20">Paid</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">INV-2026-07</p>
                  <p className="text-sm text-muted-foreground">Jul 1, 2026</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="font-medium">$49.99</div>
                  <Badge variant="outline" className="text-green-600 border-green-600/20 bg-green-500/10 hover:bg-green-500/20">Paid</Badge>
                </div>
              </div>
              
              <div className="pt-4 flex justify-center border-t border-border/50">
                <Button variant="link" className="text-muted-foreground text-sm">View full payment history</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}

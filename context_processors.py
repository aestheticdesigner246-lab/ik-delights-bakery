from .models import SiteSettings


def global_settings(request):

    settings = SiteSettings.objects.first()

    return {

        'settings': settings

    }
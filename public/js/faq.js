// Scripts for the FAQ page
(function() {
  'use strict';

  var q = document.getElementById('q');
  var ds = [].slice.call(document.querySelectorAll('details'));
  var ss = [].slice.call(document.querySelectorAll('.fq'));
  var none = document.getElementById('none');
  var fs = document.querySelector('.fs');
  var fsLinks = fs ? [].slice.call(fs.querySelectorAll('a[href^="#"]')) : [];

  // Search filtering
  if (q && ds.length) {
    q.addEventListener('input', function() {
      var v = q.value.trim().toLowerCase();
      var matchCount = 0;

      ds.forEach(function(d) {
        var text = d.textContent.toLowerCase();
        var match = !v || text.indexOf(v) > -1;
        d.hidden = !match;
        if (match) matchCount++;
      });

      ds.forEach(function(d) {
        if (!v) {
          d.open = false;
        } else if (matchCount <= 4 && !d.hidden) {
          d.open = true;
        } else {
          d.open = false;
        }
      });

      ss.forEach(function(s) {
        var hasVisible = s.querySelector('details:not([hidden])');
        s.hidden = !hasVisible;
      });

      if (none) {
        none.style.display = (matchCount === 0 && v !== '') ? 'block' : 'none';
      }
    });
  }

  // Scrollspy for sidebar navigation
  if (fsLinks.length && 'IntersectionObserver' in window) {
    var targets = fsLinks.map(function(link) {
      var id = link.getAttribute('href').slice(1);
      return document.getElementById(id);
    }).filter(Boolean);

    var updateActive = function() {
      var scrollPos = window.scrollY + 130;
      var current = '';

      for (var i = 0; i < targets.length; i++) {
        var el = targets[i];
        if (el && !el.hidden) {
          var top = el.offsetTop;
          if (scrollPos >= top) {
            current = el.id;
          }
        }
      }

      if (!current && targets.length) {
        current = targets[0].id;
      }

      fsLinks.forEach(function(link) {
        var targetId = link.getAttribute('href').slice(1);
        var isActive = targetId === current;
        if (isActive) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'true');
        } else {
          link.classList.remove('active');
          link.removeAttribute('aria-current');
        }
      });
    };

    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  }
})();
